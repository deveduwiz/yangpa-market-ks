import 'dotenv/config';
import dailyRecommendation from './src/functions/dailyRecommendation';

// 가짜 context 생성
const mockContext = {
  log: (...args: any[]) => console.log('[LOG]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

// 가짜 timer 객체
const mockTimer = {
  isPastDue: false,
  schedule: { adjustForDST: true },
  scheduleStatus: {
    last: new Date().toISOString(),
    next: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  },
};

async function main() {
  console.log('=== Daily Recommendation Function Test ===\n');

  try {
    await dailyRecommendation(mockTimer as any, mockContext as any);
    console.log('\n=== Function completed successfully ===');
  } catch (error) {
    console.error('\n=== Function failed ===');
    console.error(error);
    process.exit(1);
  }
}

main();
