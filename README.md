# RoadGuard AI

AI-powered road damage detection, risk mapping, and repair tracking that helps communities report potholes and prioritize safer streets.

## Features

- **AI Pothole & Road Damage Detection**: Instant analysis and classification of road hazards.
- **Interactive Geospatial Visualization**: 3D globe and interactive map for tracking road issues and severity.
- **Community Reporting**: Easy-to-use reporting modal with image upload, severity tags, and location picking.
- **Real-time Analytics Dashboard**: Live metrics, repair status workflows, and priority alerts for municipal agencies.

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Bundler & Dev Server**: Vite 8
- **Styling**: Tailwind CSS v4
- **Animations & Icons**: Motion, Lucide React
- **Mapping & Geospatial**: Cesium

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/essakkipandiant-git/RoadGuard.git
cd RoadGuard

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

The application will be running locally at `http://localhost:8443` (or your configured port).

### Production Build

```bash
npm run build
```

The production assets will be built in the `dist` directory.

## Deployment

Configured for one-click deployment on [Vercel](https://vercel.com/) with `vercel.json` included.
