async function fetchUserData(userId) {
  let response;
  try {
    response = await fetch(`/api/users/${userId}`);
    const data = await response.json();
    // Race condition: userId might change before this completes
    updateUI(data);
  } catch (err) {
    console.error(err);
    updateUI(null);
  }
}

function App() {
  const [userId, setUserId] = React.useState(null);
  React.useEffect(() => {
    fetchUserData(userId);
  }, [userId]);
  return <div>{/* UI */}</div>;
}