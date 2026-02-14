import { processDueTransmissions } from "./transmissions";

let transmissionSchedulerInterval: NodeJS.Timeout | null = null;
let running = false;

export function startTransmissionScheduler() {
  if (transmissionSchedulerInterval) {
    console.log("[TransmissionScheduler] already running");
    return;
  }

  console.log("[TransmissionScheduler] starting...");

  const runCycle = async () => {
    if (running) return;
    running = true;
    try {
      await processDueTransmissions();
    } catch (error) {
      console.error("[TransmissionScheduler] cycle failed", error);
    } finally {
      running = false;
    }
  };

  void runCycle();
  transmissionSchedulerInterval = setInterval(() => {
    void runCycle();
  }, 15 * 1000);
}

export function stopTransmissionScheduler() {
  if (!transmissionSchedulerInterval) return;
  clearInterval(transmissionSchedulerInterval);
  transmissionSchedulerInterval = null;
}
