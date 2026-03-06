type LoadingVariant = "table" | "page" | "card";

type LoadingStateProps = {
  variant?: LoadingVariant;
  message?: string;
};

export function LoadingState({ variant = "page", message }: LoadingStateProps) {
  const text = message ?? getDefaultMessage(variant);

  return (
    <div
      className={`loading-state loading-state-${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-spinner" aria-hidden="true" />
      <p className="loading-text">{text}</p>
    </div>
  );
}

function getDefaultMessage(variant: LoadingVariant): string {
  switch (variant) {
    case "table":
      return "Veriler yükleniyor...";
    case "card":
      return "İçerik yükleniyor...";
    case "page":
    default:
      return "Sayfa yükleniyor...";
  }
}

