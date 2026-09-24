async function runReleaseTests() {
    const reports = [
        runAkariSelfTests(),
        await runAkariAsyncSelfTests(),
        await runExtendedTests07(),
        runVersion08Tests(),
        runSyntax09Tests(),
        runBlockCodec09Tests(),
        runEditorCore09Tests(),
        await runProductVersion09Tests(),
        await runLimitBoundary09Tests(),
        runSemanticContract09Tests(),
        runDesignResize09Tests(),
        runColorPicker09Tests(),
      ],
      results = reports.flatMap((x) => x.results);
    return {
      version: VERSION,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
