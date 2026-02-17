import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';
import { NextRequest } from 'next/server';

/**
 * Mock game state type
 */
interface MockGame {
  id: string;
  isContinuous: boolean;
  isRunning: boolean;
}

/**
 * Mock database model interface
 */
interface MockModel {
  findFirst: () => Promise<MockGame | null>;
  findUnique: () => Promise<{ id: string } | null>;
  findMany: () => Promise<Array<{ id: string }>>;
  count: () => Promise<number>;
  create: () => Promise<{ id: string }>;
  update: () => Promise<{ id: string }>;
  delete: () => Promise<{ id: string }>;
  deleteMany: () => Promise<{ count: number }>;
}

/**
 * Mock database transaction callback
 */
type TransactionCallback<T> = (tx: MockDb) => Promise<T>;

/**
 * Mock database interface
 */
interface MockDb {
  game: MockModel;
  user: MockModel;
  $transaction: <T>(
    fn: TransactionCallback<T> | Array<Promise<T>>
  ) => Promise<T | T[]>;
}

/**
 * Drizzle SQL condition result
 */
interface SqlCondition {
  sql?: string;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

async function readJsonResponse(
  res: unknown
): Promise<{ [key: string]: JsonValue | undefined }> {
  if (
    typeof res === 'object' &&
    res !== null &&
    'json' in res &&
    typeof (res as { json: () => unknown }).json === 'function'
  ) {
    return (await (res as { json: () => Promise<unknown> }).json()) as {
      [key: string]: JsonValue | undefined;
    };
  }

  if (typeof res === 'object' && res !== null && 'body' in res) {
    return (res as { body: { [key: string]: JsonValue | undefined } }).body;
  }

  return {} as { [key: string]: JsonValue | undefined };
}

// Mock db with a mutable state we can control in tests
let mockGame: MockGame | null = null;

function registerAgentTickDbMocks() {
  // Create a complete mock that includes schema exports
  mock.module('@babylon/db', () => {
    const createModelMock = (
      overrides: Partial<MockModel> = {}
    ): MockModel => ({
      findFirst: mock(async () => mockGame),
      findUnique: mock(async () => null),
      findMany: mock(async () => []),
      count: mock(async () => 0),
      create: mock(async () => ({ id: 'mock-id' })),
      update: mock(async () => ({ id: 'mock-id' })),
      delete: mock(async () => ({ id: 'mock-id' })),
      deleteMany: mock(async () => ({ count: 0 })),
      ...overrides,
    });

    // Mock schema tables as empty objects
    const mockTable: Record<string, never> = {};

    // Mock Drizzle query builder (chainable and awaitable)
    const createQueryBuilder = () => {
      const builder = {
        set: mock(() => builder),
        where: mock(() => builder),
        values: mock(() => builder),
        from: mock(() => builder),
        limit: mock(() => builder),
        returning: mock(async () => [{ id: 'mock-lock-id' }]),
        onConflictDoNothing: mock(() => builder),
        // Make the builder awaitable
        then: <TResult1 = Array<{ id: string }>, TResult2 = never>(
          onFulfilled?:
            | ((
                value: Array<{ id: string }>
              ) => TResult1 | PromiseLike<TResult1>)
            | null,
          onRejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null
        ): Promise<TResult1 | TResult2> => {
          return Promise.resolve([{ id: 'mock-lock-id' }]).then(
            onFulfilled,
            onRejected
          );
        },
      };
      return builder;
    };

    return {
      db: {
        game: createModelMock(),
        user: createModelMock(),
        $transaction: async <T>(
          fn: TransactionCallback<T> | Array<Promise<T>>
        ): Promise<T | T[]> => {
          if (typeof fn === 'function') return fn({} as MockDb);
          return Promise.all(fn);
        },
        // Core Drizzle methods
        update: mock(() => createQueryBuilder()),
        insert: mock(() => createQueryBuilder()),
        delete: mock(() => createQueryBuilder()),
        select: mock(() => createQueryBuilder()),
      },
      // Schema exports (tables)
      schema: {},
      users: mockTable,
      userAgentConfigs: mockTable,
      actors: mockTable,
      posts: mockTable,
      comments: mockTable,
      games: mockTable,
      organizations: mockTable,
      balanceTransactions: mockTable,
      pointsTransactions: mockTable,
      perpPositions: mockTable,
      poolPositions: mockTable,
      markets: mockTable,
      questions: mockTable,
      generationLocks: mockTable,
      // Operators
      eq: (): SqlCondition => ({}),
      ne: (): SqlCondition => ({}),
      gt: (): SqlCondition => ({}),
      gte: (): SqlCondition => ({}),
      lt: (): SqlCondition => ({}),
      lte: (): SqlCondition => ({}),
      and: (): SqlCondition => ({}),
      or: (): SqlCondition => ({}),
      not: (): SqlCondition => ({}),
      inArray: (): SqlCondition => ({}),
      isNull: (): SqlCondition => ({}),
      sql: (): SqlCondition => ({}),
      desc: (): SqlCondition => ({}),
      asc: (): SqlCondition => ({}),
      // Transaction helpers
      withTransaction: async <T>(
        fn: (tx: MockDb) => Promise<T>
      ): Promise<T> => fn({} as MockDb),
      asUser: async <T>(
        _userId: string,
        fn: (db: MockDb) => Promise<T>
      ): Promise<T> => fn({} as MockDb),
      asSystem: async <T>(fn: (db: MockDb) => Promise<T>): Promise<T> =>
        fn({} as MockDb),
      asPublic: async <T>(fn: (db: MockDb) => Promise<T>): Promise<T> =>
        fn({} as MockDb),
    };
  });

  mock.module('@babylon/agents', () => ({
    AgentStatus: {
      ACTIVE: 'ACTIVE',
      INITIALIZED: 'INITIALIZED',
      REGISTERED: 'REGISTERED',
    },
    AgentType: {
      USER_CONTROLLED: 'USER_CONTROLLED',
    },
    agentRegistry: {
      discoverAgents: async () => [],
    },
    acquireAgentLock: async () => true,
    releaseAgentLock: async () => {},
    agentRuntimeManager: {
      getRuntime: async () => ({}),
    },
    agentService: {
      deductPoints: async () => {},
      createLog: async () => {},
    },
    autonomousCoordinator: {
      executeAutonomousTick: async () => ({
        success: true,
        method: 'test',
        actionsExecuted: {
          trades: 0,
          posts: 0,
          comments: 0,
          messages: 0,
          groupMessages: 0,
        },
      }),
    },
    hasAnyAutonomousFeature: () => false,
    getAutonomousFeatures: () => ({
      canTrade: false,
      canPost: false,
      canComment: false,
      canMessage: false,
      canGroupChat: false,
    }),
  }));

  mock.module('@babylon/api', () => ({
    verifyCronAuth: () => true,
    relayCronToStaging: async () => ({ forwarded: false }),
    recordCronExecution: () => {},
    DistributedLockService: {
      acquireLock: async () => true,
      releaseLock: async () => {},
    },
  }));

  mock.module('@/lib/engine/ensure-engine-services', () => ({
    ensureEngineServices: () => {},
  }));
}

let POST: (req: NextRequest) => Promise<Response>;

describe('Agent Tick Cron - DB State', () => {
  beforeAll(async () => {
    mock.restore();
    registerAgentTickDbMocks();
    ({ POST } = await import('@/app/api/cron/agent-tick/route'));
  });

  beforeEach(() => {
    mockGame = null;
  });

  afterAll(() => {
    mock.restore();
  });

  test('should be skipped when no continuous game exists', async () => {
    mockGame = null;

    const req = new NextRequest('http://localhost/api/cron/agent-tick', {
      method: 'POST',
    });
    const res = await POST(req);
    const data = await readJsonResponse(res);

    expect(data.success).toBe(true);
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe('No continuous game found');
  });

  test('should be paused when game.isRunning is false', async () => {
    mockGame = {
      id: 'game-123',
      isContinuous: true,
      isRunning: false,
    };

    const req = new NextRequest('http://localhost/api/cron/agent-tick', {
      method: 'POST',
    });
    const res = await POST(req);
    const data = await readJsonResponse(res);

    expect(data.success).toBe(true);
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe('Game is paused');
    expect(data.gameId).toBe('game-123');
  });

  test('should proceed when game.isRunning is true', async () => {
    mockGame = {
      id: 'game-123',
      isContinuous: true,
      isRunning: true,
    };

    const req = new NextRequest('http://localhost/api/cron/agent-tick', {
      method: 'POST',
    });
    const res = await POST(req);
    const data = await readJsonResponse(res);

    expect(data.skipped).toBeUndefined();
    expect(data.success).toBe(true);
    // Since we mocked discoverAgents to return [], it should handle 0 agents
    expect(data.processed).toBe(0);
  });
});
