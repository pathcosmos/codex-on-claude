export function Spinner({ speed = 16 }) {
  const [rotation, setRotation] = React.useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      setRotation(r => (r + 6) % 360);
    }, speed);
    // Missing cleanup: interval not cleared on unmount
  }, []);
  return <div style={{ transform: `rotate(${rotation}deg)` }}>⚙</div>;
}

export function Button({ onClick, disabled, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      {loading ? <Spinner /> : 'Click me'}
    </button>
  );
}