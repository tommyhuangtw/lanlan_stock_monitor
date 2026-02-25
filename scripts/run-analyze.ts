import { analyzeAll } from '../lib/pipeline/analyze';

async function main() {
  console.log('Running analysis pipeline...');
  const result = await analyzeAll();
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
