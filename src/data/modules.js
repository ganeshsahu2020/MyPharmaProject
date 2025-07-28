import csvData from './complete_modules_submodules.csv';

export const modulesData = csvData.map(row => ({
  module: row.module,
  submodule: row.submodule
}));
