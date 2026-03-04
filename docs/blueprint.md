# **App Name**: AutoLog

## Core Features:

- Vehicle History Management: Owners can view and manage a chronological list of all logged vehicle events (service, repairs, tire changes, inspections, upgrades) on a personal dashboard.
- Detailed Event Logging: Allows owners to add new log entries by specifying category, odometer reading, optional cost, uploading photos of receipts or stamps, and adding detailed notes.
- Firestore Data Storage: Securely store all vehicle and event data, including uploaded documentation, using Cloud Firestore for real-time updates and scalable data management.
- Public Shareable History Link: Generate a unique and short public URL for each vehicle's digital service history, allowing owners to easily share it in sales listings.
- Buyer's Public View: A clean, read-only webpage displaying the vehicle's chronological history, including images of documented events and verification indicators for buyers.
- Document Verification Tool: An AI-powered tool that analyzes uploaded images to identify if they contain valid service documentation (e.g., receipts or workshop stamps), providing a layer of trust and verification.
- PDF Export for Buyers: Enable visitors of the public history page to download a complete, well-formatted PDF summary of the vehicle's service history.

## Style Guidelines:

- Primary Color: A vibrant electric blue (#5096F7) to convey a modern, technical, and premium feel, creating high contrast with the dark background.
- Background Color: A dark, desaturated slate blue-grey (#2C3540), serving as the foundation for the standard dark mode theme, suggesting sophistication and technology.
- Accent Color: A bright teal-cyan (#70C9E1), analogous to the primary but offering a distinct contrast in saturation and brightness for highlights and interactive elements.
- Headlines: 'Space Grotesk' (sans-serif) for a modern, techy, and bold presence. Body Text: 'Inter' (sans-serif) for its clear readability and neutral, objective appearance, ideal for displaying historical data.
- Utilize Lucide-React icons, specifically 'Wrench' for service, 'Camera' for documentation upload, 'Share2' for link sharing, and 'Gauge' for odometer readings, ensuring consistency and clear visual cues.
- Focus on responsive design for all views. Interactive elements, especially buttons for logging events and sharing, should be large and finger-friendly for mobile-first interaction patterns.
- Subtle, smooth transition animations for loading states and navigation between views to enhance the premium and refined user experience.