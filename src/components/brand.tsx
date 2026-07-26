import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand-mark" href="/" aria-label="Skill Gaming World home">
      <span className="brand-seal" aria-hidden="true">
        <span>SG</span>
      </span>
      {!compact && (
        <span className="brand-type">
          <strong>Skill Gaming World</strong>
          <small>Measured play. Transparent rules.</small>
        </span>
      )}
    </Link>
  );
}

export function MonetaireMark() {
  return (
    <span className="monetaire-mark" aria-label="Monetaire">
      Monetaire<span aria-hidden="true">.</span>
    </span>
  );
}
