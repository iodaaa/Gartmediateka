import { library } from "../src/server/library";
async function main() {
  const service = library();
  try {
    console.log(JSON.stringify(await service.scan(), null, 2));
  } finally {
    await service.db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
