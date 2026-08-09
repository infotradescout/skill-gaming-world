import { getHeapStatistics } from "node:v8";
import os from "node:os";

// The managed verification workspace intentionally does not expose /proc.
// Node's Linux RSS lookup therefore throws before Next can compile. Keep this
// preload scoped to build:verify and approximate RSS from V8 heap statistics;
// ordinary runtimes continue to use Node's native process.memoryUsage().
try {
  process.memoryUsage();
} catch (error) {
  if (!error || error.syscall !== "uv_resident_set_memory") {
    throw error;
  }

  const compatibleMemoryUsage = () => {
    const heap = getHeapStatistics();
    const external = heap.external_memory ?? 0;
    return {
      rss: heap.total_heap_size + external,
      heapTotal: heap.total_heap_size,
      heapUsed: heap.used_heap_size,
      external,
      arrayBuffers: 0,
    };
  };

  compatibleMemoryUsage.rss = () => compatibleMemoryUsage().rss;
  process.memoryUsage = compatibleMemoryUsage;
}

try {
  os.networkInterfaces();
} catch (error) {
  if (!error || error.syscall !== "uv_interface_addresses") {
    throw error;
  }

  os.networkInterfaces = () => ({
    lo: [
      {
        address: "127.0.0.1",
        netmask: "255.0.0.0",
        family: "IPv4",
        mac: "00:00:00:00:00:00",
        internal: true,
        cidr: "127.0.0.1/8",
      },
    ],
  });
}
