import { useState, useEffect } from 'react'

function App() {
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Pagination state
  const [page, setPage] = useState(1)
  const [paginationData, setPaginationData] = useState(null)

  const [isUpdating, setIsUpdating] = useState(false);

  const triggerUpdate = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/api/update", {
        method: "POST",
      });
      const data = await response.json();
      alert(data.message); // Tells the user the job started!
    } catch (err) {
      console.error("Update failed:", err);
      alert("Failed to start update pipeline.");
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    const fetchHoldings = async () => {
      setLoading(true)
      setError(null)
      try {
        // Fetching directly from your new FastAPI endpoint!
        const response = await fetch(`http://127.0.0.1:8000/api/holdings?page=${page}&limit=50`)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const json = await response.json()
        setHoldings(json.data)
        setPaginationData(json.pagination)
      } catch (err) {
        console.error("Failed to fetch holdings:", err)
        setError("Failed to load data. Is your FastAPI server running?")
      } finally {
        setLoading(false)
      }
    }

    fetchHoldings()
  }, [page]) // Re-run the fetch every time the 'page' state changes

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>🌍 NBIM Portfolio Tracker</h1>
      <p>Live financial data powered by Yahoo Finance</p>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={triggerUpdate} 
          disabled={isUpdating}
          style={{
            backgroundColor: isUpdating ? '#555' : '#2563eb',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '6px',
            cursor: isUpdating ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isUpdating ? 'Starting Pipeline...' : '🔄 Fetch Live Market Data'}
        </button>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <p>Loading companies...</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #555' }}>
                <th style={{ padding: '12px' }}>Company</th>
                <th style={{ padding: '12px' }}>Ticker</th>
                <th style={{ padding: '12px' }}>Sector</th>
                <th style={{ padding: '12px' }}>Country</th>
                <th style={{ padding: '12px' }}>P/E Ratio</th>
                <th style={{ padding: '12px' }}>Market Cap (USD)</th>
                <th style={{ padding: '12px' }}>52W Range</th>
                <th style={{ padding: '12px' }}>Last Fetched</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((company, index) => (
                <tr key={`${company.Yahoo_Ticker}-${index}`} style={{ borderBottom: '1px solid #333' }}>
                  <td style={{ padding: '12px' }}><strong>{company.Name}</strong></td>
                  <td style={{ padding: '12px' }}>{company.Yahoo_Ticker}</td>
                  <td style={{ padding: '12px' }}>{company.sector || 'N/A'}</td>
                  <td style={{ padding: '12px' }}>{company.country || 'N/A'}</td>
                  <td style={{ padding: '12px' }}>
                    {company.pe_ratio ? parseFloat(company.pe_ratio).toFixed(2) : 'N/A'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {company.market_cap ? `$${(company.market_cap / 1e9).toFixed(2)}B` : 'N/A'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {company.low_52w && company.high_52w 
                      ? `$${parseFloat(company.low_52w).toFixed(2)} - $${parseFloat(company.high_52w).toFixed(2)}` 
                      : 'N/A'}
                  </td>
                  <td style={{ padding: '12px', fontSize: '0.85em', opacity: 0.7 }}>
                    {company.fetched_at ? company.fetched_at.split(' ')[0] : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {paginationData && (
            <div style={{ marginTop: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: '8px 16px', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              
              <span>
                Page {paginationData.current_page} of {paginationData.total_pages} 
                <span style={{ opacity: 0.6, marginLeft: '10px' }}>
                  ({paginationData.total_count} total companies)
                </span>
              </span>

              <button 
                onClick={() => setPage(p => Math.min(paginationData.total_pages, p + 1))}
                disabled={page === paginationData.total_pages}
                style={{ padding: '8px 16px', cursor: page === paginationData.total_pages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App