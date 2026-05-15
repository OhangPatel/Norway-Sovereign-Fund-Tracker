import requests
import json

class FinancialLLM:
    def __init__(self, model_name="mistral"):
        self.api_url = "http://127.0.0.1:11434/api/generate"
        self.model = model_name

    def generate_report(self, company):
        prompt = f"""
        You are a financial analyst assistant. Respond ONLY in valid JSON.
        
        Analyze the following company:
        Name: {company.get('name', 'N/A')}
        Sector: {company.get('sector', 'N/A')}
        Country: {company.get('country', 'N/A')}
        P/E Ratio: {company.get('pe_ratio', 'N/A')}
        Market Cap: {company.get('market_cap', 'N/A')}

        Return a JSON object with EXACTLY these keys:
        - "description": 2 sentences explaining what the company does.
        - "outlook": 1 sentence on the future financial outlook based on the P/E and sector.
        - "key_risks": A list of exactly 3 strings detailing potential investment risks.
        """

        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }

        try:
            # 60 second timeout gives Mistral plenty of time to think locally
            response = requests.post(self.api_url, json=payload, timeout=60.0)
            
            if response.status_code != 200:
                print(f"⚠️ Ollama Rejected the Request! Code: {response.status_code}")
                raise Exception("Ollama API Error")
            
            raw_content = response.json()["response"]
            parsed_json = json.loads(raw_content)
            return parsed_json
            
        except requests.exceptions.ConnectionError:
            print("⚠️ Connection Error: Is the Ollama app definitely running on your Mac?")
        except json.JSONDecodeError:
            print("⚠️ Model returned malformed JSON.")
        except Exception as e:
            print(f"⚠️ Unexpected LLM Error: {e}")

        return {
            "description": "Report generation failed. AI service unavailable.",
            "outlook": "Data unavailable.",
            "key_risks": ["API Connection Error", "Model Timeout", "Parsing Failure"]
        }