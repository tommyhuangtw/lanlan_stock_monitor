import { transcribeAll } from '../lib/pipeline/transcribe';

async function main() {
  console.log('Running transcription pipeline...');
  const result = await transcribeAll();
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
