from datetime import date

class EconomicDataService:
    def get_latest_indicators(self):
        """
        Returns structured macro-economic data.
        Currently using mock data as per requirements, but ready for API integration.
        """
        # Mock Data following the requested structure
        import requests
        from datetime import datetime, timezone
        
        try:
            # ForexFactory publicly available JSON feed (Current Week)
            url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json()
            
            # Filter for High/Medium impact events relevant to Cryptocurrency (USD, EUR, GBP, JPY, CNY)
            relevant_fiat = ["USD", "EUR", "GBP", "JPY", "CNY"]
            
            # Get current time using timezone-aware UTC datetime
            now = datetime.now(timezone.utc)
            processed_events = []
            
            for item in data:
                if item.get("country") in relevant_fiat and item.get("impact") in ["High", "Medium"]:
                    
                    # Parse date string "2024-03-20T18:30:00-04:00"
                    date_str = item.get("date", "")
                    status = "Upcoming"
                    formatted_date = date_str
                    
                    if date_str:
                        try:
                            # Parse standard ISO format
                            dt = datetime.fromisoformat(date_str)
                            # Simple string formatting for the UI
                            formatted_date = dt.strftime("%Y-%m-%d %H:%M UTC")
                            
                            if dt < now:
                                status = "Published"
                        except Exception:
                            pass
                            
                    processed_events.append({
                        "event": item.get("title", "Unknown Event"),
                        "actual": item.get("actual") or None,
                        "forecast": item.get("forecast") or None,
                        "previous": item.get("previous") or None,
                        "impact": item.get("impact", "Low"),
                        "date": formatted_date,
                        "status": status
                    })
                    
            # Return top 15 most relevant upcoming/recent events
            return processed_events[:15]
            
        except Exception as e:
            print(f"Error fetching economic calendar: {e}")
            return []

economic_service = EconomicDataService()
