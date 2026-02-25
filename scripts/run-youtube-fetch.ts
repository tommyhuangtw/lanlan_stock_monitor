import { fetchYoutube } from '../lib/pipeline/fetch-youtube';

async function main() {
  console.log('Running YouTube fetch pipeline...');
  const result = await fetchYoutube();
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
