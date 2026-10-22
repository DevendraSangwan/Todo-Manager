import("./backend/src/seedDemoData.js").catch((error) => {
  console.error("Demo data seeding failed:", error.message);
  process.exitCode = 1;
});
