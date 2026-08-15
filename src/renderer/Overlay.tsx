import { useEffect, useState } from "react";
import type { ActiveTimerEvent } from "../shared/types";

export function Overlay() {
  const [timers, setTimers] = useState<ActiveTimerEvent[]>([]);
  const [now, setNow] = useState(Date.now());
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const unsubscribeTimer = window.analyzer.onTimerStarted((timer) => {
      setTimers((current) =>
        [
          timer,
          ...current.filter((item) => item.ruleId !== timer.ruleId),
        ].slice(0, 5),
      );
    });
    const unsubscribeMove = window.analyzer.onOverlayMoveModeChanged(setMoving);
    const interval = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      setTimers((current) =>
        current.filter((timer) => remainingSeconds(timer, currentTime) > -2),
      );
    }, 100);
    return () => {
      unsubscribeTimer();
      unsubscribeMove();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className={`overlay-shell ${moving ? "moving" : ""}`}>
      {moving && (
        <div className="overlay-move-bar">
          <span>Drag overlay to position</span>
          <button onClick={() => void window.analyzer.finishOverlayMove()}>
            Done
          </button>
        </div>
      )}
      <div className="overlay-heading">
        <span className="overlay-live" /> ANKA TIMERS
      </div>
      {timers.length === 0 ? (
        <div className="overlay-empty">
          <span>Canlı güç bekleniyor</span>
          <small>
            Eşleşen düşman gücü kullanıldığında sayaç burada başlayacak.
          </small>
        </div>
      ) : (
        <div className="overlay-timers">
          {timers.map((timer) => {
            const remaining = Math.max(0, remainingSeconds(timer, now));
            const progress = Math.max(
              0,
              Math.min(1, remaining / timer.durationSeconds),
            );
            const warning = remaining <= timer.warningSeconds;
            return (
              <div
                className={`overlay-timer ${warning ? "warning" : ""}`}
                key={timer.timerId}
              >
                <div>
                  <small>{timer.enemyName}</small>
                  <strong>{timer.abilityName}</strong>
                </div>
                <b>{remaining.toFixed(1)}</b>
                <span className="overlay-progress">
                  <i style={{ width: `${progress * 100}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function remainingSeconds(timer: ActiveTimerEvent, now: number): number {
  return timer.durationSeconds - (now - timer.startedAt) / 1_000;
}
