type LoadingDotsProps = {
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

export default function LoadingDots({
  label = 'Loading',
  className = '',
  size = 'md',
}: LoadingDotsProps) {
  const classes = ['dot-loader', `dot-loader--${size}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" aria-live="polite">
      <span className="dot-loader__orbit" aria-hidden="true">
        <span className="dot-loader__dot" />
      </span>
      <span className="dot-loader__label">{label}</span>
    </div>
  );
}
