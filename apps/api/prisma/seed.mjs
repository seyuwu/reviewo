async function main() {
  console.log("No seed data configured yet.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
