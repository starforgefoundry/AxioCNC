import { createSelector } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "./index";

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Selectors for computed values from backendStatus
const selectBackendStatus = (state: RootState) => state.machine.backendStatus;

// Computed connection state
export const selectIsConnected = createSelector(
  [selectBackendStatus],
  (backendStatus) => backendStatus?.connected ?? false,
);

export const selectConnectedPort = createSelector(
  [selectBackendStatus],
  (backendStatus) => backendStatus?.port ?? null,
);

// Computed position values (parsed from strings to numbers)
// Includes optional A, B, C axes when reported by the controller
export const selectMachinePosition = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const mpos = backendStatus?.controllerState?.mpos;
    if (!mpos)
      return { x: 0, y: 0, z: 0 } as {
        x: number;
        y: number;
        z: number;
        a?: number;
        b?: number;
        c?: number;
      };
    const result: {
      x: number;
      y: number;
      z: number;
      a?: number;
      b?: number;
      c?: number;
    } = {
      x: parseFloat(mpos.x || "0"),
      y: parseFloat(mpos.y || "0"),
      z: parseFloat(mpos.z || "0"),
    };
    if (mpos.a !== undefined) result.a = parseFloat(mpos.a);
    if (mpos.b !== undefined) result.b = parseFloat(mpos.b);
    if (mpos.c !== undefined) result.c = parseFloat(mpos.c);
    return result;
  },
);

export const selectWorkPosition = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const wpos = backendStatus?.controllerState?.wpos;
    if (!wpos)
      return { x: 0, y: 0, z: 0 } as {
        x: number;
        y: number;
        z: number;
        a?: number;
        b?: number;
        c?: number;
      };
    const result: {
      x: number;
      y: number;
      z: number;
      a?: number;
      b?: number;
      c?: number;
    } = {
      x: parseFloat(wpos.x || "0"),
      y: parseFloat(wpos.y || "0"),
      z: parseFloat(wpos.z || "0"),
    };
    if (wpos.a !== undefined) result.a = parseFloat(wpos.a);
    if (wpos.b !== undefined) result.b = parseFloat(wpos.b);
    if (wpos.c !== undefined) result.c = parseFloat(wpos.c);
    return result;
  },
);

// Detect which axes are available based on controller position reports
// X, Y, Z are always available; A, B, C appear only when reported by the controller
export const selectAvailableAxes = createSelector(
  [selectBackendStatus],
  (backendStatus): ("x" | "y" | "z" | "a" | "b" | "c")[] => {
    const axes: ("x" | "y" | "z" | "a" | "b" | "c")[] = ["x", "y", "z"];
    const mpos = backendStatus?.controllerState?.mpos;
    if (mpos) {
      if (mpos.a !== undefined) axes.push("a");
      if (mpos.b !== undefined) axes.push("b");
      if (mpos.c !== undefined) axes.push("c");
    }
    return axes;
  },
);

// Computed spindle state
export const selectSpindleState = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const spindle = backendStatus?.parserstate?.modal?.spindle;
    if (spindle === "M3" || spindle === "M4" || spindle === "M5") {
      return spindle;
    }
    return "M5" as const;
  },
);

export const selectSpindleSpeed = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const speed = backendStatus?.parserstate?.spindle;
    return speed ? parseFloat(speed || "0") : 0;
  },
);

// Computed tool
export const selectCurrentTool = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const tool = backendStatus?.parserstate?.tool;
    const toolNum = tool ? parseFloat(tool || "0") : 0;
    return toolNum > 0 ? toolNum : undefined;
  },
);

// Computed feedrate
export const selectFeedrate = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const feedrate = backendStatus?.parserstate?.feedrate;
    return feedrate ? parseFloat(feedrate || "0") : 0;
  },
);

// Computed override values (feed%, rapid%, spindle%)
export const selectOverrideValues = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const ov = backendStatus?.controllerState?.ov;
    if (!ov || ov.length < 3) return { feed: 100, rapid: 100, spindle: 100 };
    return {
      feed: ov[0],
      rapid: ov[1],
      spindle: ov[2],
    };
  },
);

// Computed buffer state
export const selectRxBufferSize = createSelector(
  [selectBackendStatus],
  (backendStatus) => backendStatus?.status?.buf?.rx ?? 0,
);

export const selectPlannerQueue = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const availableBlocks = backendStatus?.status?.buf?.planner ?? 0;
    const maxBlocks = 15;
    const usedBlocks = Math.max(0, maxBlocks - availableBlocks);
    return { depth: usedBlocks, max: maxBlocks };
  },
);

// Computed workflow state
export const selectWorkflowState = createSelector(
  [selectBackendStatus],
  (backendStatus) => backendStatus?.workflowState ?? null,
);

// Computed work coordinate system
export const selectCurrentWCS = createSelector(
  [selectBackendStatus],
  (backendStatus) => {
    const wcs = backendStatus?.parserstate?.modal?.wcs;
    return wcs || "G54";
  },
);

export const selectIsJobRunning = createSelector(
  [selectBackendStatus],
  (backendStatus) => backendStatus?.isJobRunning ?? false,
);

// Computed homed state
export const selectIsHomed = createSelector(
  [selectBackendStatus],
  (backendStatus) => backendStatus?.isHomed ?? false,
);

// Convenience hooks for machine state
export const useMachineState = () => useAppSelector((state) => state.machine);
export const useJobState = () => useAppSelector((state) => state.job);

// Convenience hooks for computed values
export const useIsConnected = () => useAppSelector(selectIsConnected);
export const useConnectedPort = () => useAppSelector(selectConnectedPort);
export const useMachinePosition = () => useAppSelector(selectMachinePosition);
export const useWorkPosition = () => useAppSelector(selectWorkPosition);
export const useSpindleState = () => useAppSelector(selectSpindleState);
export const useSpindleSpeed = () => useAppSelector(selectSpindleSpeed);
export const useCurrentTool = () => useAppSelector(selectCurrentTool);
export const useFeedrate = () => useAppSelector(selectFeedrate);
export const useRxBufferSize = () => useAppSelector(selectRxBufferSize);
export const usePlannerQueue = () => useAppSelector(selectPlannerQueue);
export const useWorkflowState = () => useAppSelector(selectWorkflowState);
export const useIsJobRunning = () => useAppSelector(selectIsJobRunning);
export const useIsHomed = () => useAppSelector(selectIsHomed);
export const useCurrentWCS = () => useAppSelector(selectCurrentWCS);
export const useOverrideValues = () => useAppSelector(selectOverrideValues);
export const useAvailableAxes = () => useAppSelector(selectAvailableAxes);
