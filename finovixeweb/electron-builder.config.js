module.exports = {
  appId: "com.tupos.pos",
  productName: "TuPOS",
  directories: {
    output: "release"
  },
  compression: "maximum",
  asar: true,
  asarUnpack: ["**/*.node"],
  files: [
    "dist/**/*",
    "src/main/**/*",
    "!**/*.map",
    "!**/node_modules/*/{test,__tests__,tests,sample,example,spec}/**/*"
  ],
  win: {
    target: ["nsis"],
    icon: "public/icon.ico"
  },
  nsis: {
    oneClick: true,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    perMachine: false
  },
  nodeGypRebuild: false,
  buildDependenciesFromSource: false
};