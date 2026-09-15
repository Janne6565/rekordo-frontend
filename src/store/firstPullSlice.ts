import { signedOut } from "@/store/authSlice";
import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

/**
 * Where the first pull of a browser that has never synced has got to (loading 1b).
 *
 * `idle` is both "never started" and "finished": the screen only cares whether there is
 * still something to wait for. `pulling` covers the sync pages, which carry the collection
 * and the wishlist together; `catalogue` is everything the engine does after the last page
 * (photo bytes, then the releases the pulled copies point at), which is what turns a shelf
 * of untitled placeholders into one with titles and sleeves.
 */
export type FirstPullStage = "idle" | "pulling" | "catalogue";

interface FirstPullState {
  readonly stage: FirstPullStage;
  /** Live copies received so far. Tombstones are not counted: nobody owns a deleted record. */
  readonly copies: number;
  readonly wishes: number;
}

const initialState: FirstPullState = { stage: "idle", copies: 0, wishes: 0 };

const firstPullSlice = createSlice({
  name: "firstPull",
  initialState,
  reducers: {
    firstPullStarted() {
      return { stage: "pulling", copies: 0, wishes: 0 };
    },
    /**
     * One sync page arrived. Ignored outside `pulling`, so the steady-state sync every minute
     * can report its pages without ever reopening the screen.
     */
    firstPullPage(state, action: PayloadAction<{ copies: number; wishes: number; last: boolean }>) {
      if (state.stage !== "pulling") return;
      state.copies += action.payload.copies;
      state.wishes += action.payload.wishes;
      if (action.payload.last) state.stage = "catalogue";
    },
    /** Resolved or failed alike: the shelf is the place to be either way. */
    firstPullFinished() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialState);
  },
});

export const { firstPullStarted, firstPullPage, firstPullFinished } = firstPullSlice.actions;
export default firstPullSlice.reducer;
