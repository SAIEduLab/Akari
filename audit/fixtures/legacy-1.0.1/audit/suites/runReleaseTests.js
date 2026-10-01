async function runReleaseTests() {
    const reports = [
        runAkariSelfTests(),
        await runAkariAsyncSelfTests(),
        await runExtendedTests(),
        runCoreTests(),
        runSyntaxTests(),
        runBlockCodecTests(),
        runEditorCoreTests(),
        await runProductContractTests(),
        await runLimitBoundaryTests(),
        runSemanticContractTests(),
        runDesignResizeTests(),
        runColorPickerTests(),
      ],
      results = reports.flatMap((x) => x.results);
    return {
      version: PRODUCT_RELEASE,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
