console.log("PRELOAD RAN", globalThis.Module?.TOTAL_MEMORY);

globalThis.Module = {
  TOTAL_MEMORY: 512 * 1024 * 1024
};

console.log("PRELOAD RAN", globalThis.Module?.TOTAL_MEMORY);
