import { createContext, useContext, useState, ReactNode } from "react";

export type Slide = { id: string; url: string; name: string };
export type RecordingResult = {
  videoUrl: string;
  duration: number; // seconds
  slides: Slide[];
  slideMarkers: { slideId: string; time: number }[]; // when each slide was shown
};

type Ctx = {
  view: "home" | "record" | "edit";
  setView: (v: "home" | "record" | "edit") => void;
  recording: RecordingResult | null;
  setRecording: (r: RecordingResult | null) => void;
  /** When set, the editor should append this recording as a new scene rather than reset. */
  appendRecording: RecordingResult | null;
  setAppendRecording: (r: RecordingResult | null) => void;
};

const C = createContext<Ctx | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<Ctx["view"]>("edit");
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [appendRecording, setAppendRecording] = useState<RecordingResult | null>(null);
  return (
    <C.Provider value={{ view, setView, recording, setRecording, appendRecording, setAppendRecording }}>
      {children}
    </C.Provider>
  );
}

export const useStudio = () => {
  const v = useContext(C);
  if (!v) throw new Error("StudioProvider missing");
  return v;
};
