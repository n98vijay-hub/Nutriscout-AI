export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
    if (req.method === 'OPTIONS') { res.status(200).end(); return }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  
    const { productName, ingredients, conditions, allergies } = req.body
  
    if (!ingredients) {
      res.status(400).json({ error: 'No ingredients provided' }); return
    }
  
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `You are NutriScout AI — a health-focused ingredient analyst.
  
  Product: ${productName}
  Ingredients: ${ingredients}
  User health conditions: ${conditions?.join(', ') || 'None specified'}
  User allergies: ${allergies?.join(', ') || 'None specified'}
  
  Give a short, plain-English health analysis in exactly this JSON format:
  {
    "summary": "2-3 sentence overall verdict for this specific user",
    "topConcern": "The single biggest health concern in this product for this user",
    "bestThing": "The one best/healthiest aspect of this product",
    "verdict": "BUY",
    "verdictReason": "One sentence explaining the verdict"
  }
  
  The verdict must be exactly one of: BUY, AVOID, or LIMIT.
  Return ONLY the JSON. No other text.`
          }]
        })
      })
  
      const data = await response.json()
      const text = data.content?.[0]?.text || '{}'
  
      let analysis
      try {
        analysis = JSON.parse(text)
      } catch {
        analysis = {
          summary: text,
          topConcern: '',
          bestThing: '',
          verdict: 'LIMIT',
          verdictReason: ''
        }
      }
  
      res.status(200).json({ analysis })
    } catch (error) {
      res.status(500).json({ error: 'AI analysis failed', details: error.message })
    }
  }