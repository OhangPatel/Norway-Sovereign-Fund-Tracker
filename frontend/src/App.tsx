import { useState, useEffect } from 'react'

function App() {
  const [dataCount, setDataCount] = useState(0);
  const [message, setMessage] = useState("Ready to test.");

  // 1. Fetch data on load
  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/holdings")
      .then(res => res.json())
      .then(data => {
        if (data.status === "error") {
          setMessage("Backend Error: " + data.message);
        } else {
          setDataCount(data.length);
        }
      })
      .catch(() => setMessage("Failed to connect to backend."));
  }, []);

  // 2. Test the Update Button Logic
  const testUpdate = () => {
    setMessage("Sending request...");
    
    fetch("http://127.0.0.1:8000/api/trigger-update", { method: "POST" })
      .then(res => res.json())
      .then(result => {
        // This will print the exact status: "started", "running", or "cooldown"
        setMessage(`Status: [${result.status.toUpperCase()}] - ${result.message}`);
      })
      .catch(() => setMessage("Failed to trigger update."));
  };

  return (
    <div style={{ padding: "50px" }}>
      <h1>Logic Test Page</h1>
      
      <h3>1. Database Connection:</h3>
      <p>Items in Database: <strong>{dataCount}</strong></p>
      
      <h3>2. Button Logic:</h3>
      <button onClick={testUpdate} style={{ padding: "10px", fontSize: "16px" }}>
        TEST UPDATE BUTTON
      </button>
      
      <div style={{ marginTop: "20px", padding: "10px", border: "2px solid black", backgroundColor: "#eee" }}>
        <strong>Server Reply:</strong> <br/>
        {message}
      </div>
    </div>
  )
}

export default App