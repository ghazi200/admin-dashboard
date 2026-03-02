#!/usr/bin/env python3
"""
Create a test PDF with lunch policy information
"""
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import inch
    
    def create_pdf():
        filename = "lunch_policy_test.pdf"
        c = canvas.Canvas(filename, pagesize=letter)
        width, height = letter
        
        # Title
        c.setFont("Helvetica-Bold", 20)
        c.drawString(50, height - 50, "Company Policy Handbook")
        
        # Section
        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, height - 100, "Section: Breaks and Meal Periods")
        
        # Lunch Policy
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, height - 140, "Lunch Policy:")
        
        c.setFont("Helvetica", 12)
        text_lines = [
            "All employees are entitled to a 30 minute paid break for lunch.",
            "This break is mandatory and must be taken during the assigned",
            "shift period. The lunch break is paid time and does not extend",
            "your work hours.",
            "",
            "Additional Break Information:",
            "- Break duration: 30 minutes",
            "- Break type: Paid",
            "- Scheduling: During assigned shift"
        ]
        
        y_position = height - 170
        for line in text_lines:
            c.drawString(50, y_position, line)
            y_position -= 20
        
        c.save()
        print(f"✅ Created {filename}")
        print(f"📄 Location: {__file__.replace('create_lunch_policy_pdf.py', filename)}")
        return filename
        
    if __name__ == "__main__":
        create_pdf()
        
except ImportError:
    print("❌ reportlab not installed")
    print("Installing reportlab...")
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "reportlab"])
    create_pdf()
