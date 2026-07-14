function createCredentialRepairCycle() {
  let exhausted = false;

  return {
    isExhausted() {
      return exhausted;
    },

    markAuthenticatedReady() {
      exhausted = false;
    },

    async repairCredentialsOnce({
      stop,
      rewriteCredentials,
      restart,
    }) {
      if (exhausted) {
        return { attempted: false, authenticated: false, exhausted: true };
      }
      exhausted = true;
      await stop();
      await rewriteCredentials();
      const result = await restart();
      if (result?.authenticated === true) {
        exhausted = false;
        return {
          attempted: true,
          authenticated: true,
          exhausted: false,
          value: result.value,
        };
      }
      return {
        attempted: true,
        authenticated: false,
        exhausted: true,
        value: result?.value,
      };
    },
  };
}

module.exports = {
  createCredentialRepairCycle,
};
