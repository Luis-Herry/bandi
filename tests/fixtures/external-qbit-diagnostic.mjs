export async function diagnoseExternalQbit() {
  globalThis.__bandiExternalQbitRouteCalls =
    (globalThis.__bandiExternalQbitRouteCalls || 0) + 1;
  return {
    connected: true,
    url: "http://127.0.0.1:18080",
    version: "test",
  };
}
