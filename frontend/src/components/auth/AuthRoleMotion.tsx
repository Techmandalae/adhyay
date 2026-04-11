"use client";

type AuthMotionRole = "school" | "teacher" | "student" | "parent";

type AuthRoleMotionProps = {
  role: AuthMotionRole;
  active?: boolean;
};

export function AuthRoleMotion({ role, active = true }: AuthRoleMotionProps) {
  return (
    <div
      aria-hidden="true"
      className={`auth-role-motion auth-role-motion--${role} ${active ? "" : "auth-role-motion--paused"}`.trim()}
    >
      <div className="auth-role-motion__aurora" />
      <div className="auth-role-motion__grid" />

      {role === "school" ? (
        <div className="auth-role-motion__stack auth-role-motion__stack--school">
          <div className="auth-role-card auth-role-card--wide">
            <div className="auth-role-card__header">
              <span className="auth-role-card__eyebrow">School overview</span>
              <span className="auth-role-card__badge">Live</span>
            </div>
            <div className="auth-role-bars">
              <span style={{ height: "52%" }} />
              <span style={{ height: "76%" }} />
              <span style={{ height: "64%" }} />
              <span style={{ height: "88%" }} />
            </div>
          </div>
          <div className="auth-role-orbit auth-role-orbit--one" />
          <div className="auth-role-orbit auth-role-orbit--two" />
        </div>
      ) : null}

      {role === "teacher" ? (
        <div className="auth-role-motion__stack auth-role-motion__stack--teacher">
          <div className="auth-role-book">
            <span className="auth-role-book__cover" />
            <span className="auth-role-book__page auth-role-book__page--one" />
            <span className="auth-role-book__page auth-role-book__page--two" />
            <span className="auth-role-book__page auth-role-book__page--three" />
          </div>
          <div className="auth-role-chip auth-role-chip--teacher">Exam Flow</div>
        </div>
      ) : null}

      {role === "student" ? (
        <div className="auth-role-motion__stack auth-role-motion__stack--student">
          <div className="auth-role-sheet">
            <div className="auth-role-sheet__line" />
            <div className="auth-role-sheet__line" />
            <div className="auth-role-sheet__line" />
            <div className="auth-role-choice">
              <span />
              <span />
              <span className="auth-role-choice__active" />
            </div>
          </div>
          <div className="auth-role-cursor" />
        </div>
      ) : null}

      {role === "parent" ? (
        <div className="auth-role-motion__stack auth-role-motion__stack--parent">
          <div className="auth-role-card auth-role-card--chart">
            <div className="auth-role-card__header">
              <span className="auth-role-card__eyebrow">Progress</span>
              <span className="auth-role-card__badge">Weekly</span>
            </div>
            <div className="auth-role-trend">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="auth-role-pulse auth-role-pulse--one" />
          <div className="auth-role-pulse auth-role-pulse--two" />
        </div>
      ) : null}
    </div>
  );
}
