type ErrorAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
};

type ErrorStateProps = {
  statusCode?: number;
  title: string;
  description?: string;
  actions?: ErrorAction[];
};

export function ErrorState({ statusCode, title, description, actions }: ErrorStateProps) {
  return (
    <section
      className="page-error"
      role="alert"
      aria-labelledby="error-state-heading"
      aria-live="assertive"
    >
      <h2 id="error-state-heading" className="page-error-title">
        {title}
      </h2>
      {statusCode != null && (
        <p className="page-error-status">HTTP durum kodu: {statusCode}</p>
      )}
      {description && <p className="page-error-description">{description}</p>}
      {actions && actions.length > 0 && (
        <div className="page-error-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.variant === "secondary" ? "secondary-button" : "primary-button"}
              onClick={action.onClick}
              aria-label={action.label}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

