export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startFileCleanup } = await import("./lib/files/cleanup");
    startFileCleanup();
  }
}
