/** Shared controls keep selection, touch targets and feedback consistent. */
export function SegmentedControl({ label, value, onChange, options, className = '' }) {
  return <div className={`ui-segments ${className}`} role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value}
      disabled={option.disabled} onClick={() => onChange(option.value)}>
      {option.icon && <span aria-hidden="true">{option.icon}</span>}<span>{option.label}</span>
    </button>)}
  </div>;
}
export function ComponentHeading({ eyebrow, title, description, children }) {
  return <div className="ui-component-heading"><div>{eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}<h3>{title}</h3>{description && <p>{description}</p>}</div>{children && <div className="ui-heading-actions">{children}</div>}</div>;
}
export function AssetMark({ ticker }) {
  return <span className="ui-asset-mark" aria-hidden="true">{ticker.slice(0, 2)}</span>;
}

export function MetricGrid({ label, items }) {
  return <dl className="ui-metric-grid" aria-label={label}>{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd className="tabular-nums">{item.value}</dd>{item.hint && <dd className="ui-metric-hint">{item.hint}</dd>}</div>)}</dl>;
}
