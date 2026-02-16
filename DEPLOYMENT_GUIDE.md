# Raagam Deployment Guide

## GitHub Pages Deployment (Frontend Only)

### Current Setup
- Frontend deployed to GitHub Pages using GitHub Actions
- Demo mode enabled for static deployment
- Bundle size: ~189KB (well within limits)

### Limitations
- GitHub Pages only serves static files
- Backend API cannot be hosted on GitHub Pages
- For full functionality, backend must be deployed separately

### Deployment Steps
1. Ensure repository is public (GitHub Pages requires public repos)
2. Enable GitHub Pages in repository settings:
   - Go to Settings → Pages
   - Source: GitHub Actions
3. Push to main branch to trigger deployment
4. Access at: `https://[username].github.io/personalMusicPlayer/`

## Backend Deployment Alternatives

Since GitHub Pages cannot host the Node.js backend, deploy it separately:

### Option 1: Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

**Pros**: Free tier, easy setup, persistent database
**Free Tier**: 512MB RAM, 1GB disk, 100 hours/month

### Option 2: Render
- Connect GitHub repo
- Select "Web Service"
- Build Command: `npm install && npm run build` (if needed)
- Start Command: `npm start`

**Pros**: Free tier, good for APIs
**Free Tier**: 750 hours/month, persistent disk

### Option 3: Vercel (with Serverless Functions)
- Deploy backend as serverless functions
- Modify backend to use Vercel functions structure

**Pros**: Fast, scalable
**Free Tier**: 100GB bandwidth, serverless functions

### Option 4: Heroku
```bash
# Install Heroku CLI
npm install -g heroku

# Deploy
heroku create raagam-backend
git push heroku main
```

**Pros**: Mature platform
**Free Tier**: Limited, may require credit card

## Full-Stack Alternatives (Better for Raagam)

### Vercel (Recommended for Full-Stack)
- Frontend: Static deployment
- Backend: Serverless functions
- Database: Vercel Postgres or external

**Setup**:
1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel`
3. Configure API routes as serverless functions

### Netlify
- Frontend: Static deployment
- Backend: Netlify Functions
- Database: External (PlanetScale, Supabase)

**Setup**:
1. Connect GitHub repo
2. Configure build settings
3. Add function files in `netlify/functions/`

### Railway (Full-Stack)
- Both frontend and backend in one service
- Use Docker for deployment

## Environment Configuration

### For GitHub Pages + External Backend
```bash
# In frontend/.env.production
VITE_API_BASE=https://your-backend-url.com/api
VITE_DEMO_MODE=false
```

### For Full-Stack Deployment
- Set environment variables in deployment platform
- Configure CORS for frontend domain

## Bundle Size Optimization

Current bundle: 174KB JS (53KB gzipped) - Well within limits

### Further Optimizations (if needed)
1. **Code Splitting**: Split vendor and app code
2. **Lazy Loading**: Load components on demand
3. **Image Optimization**: Compress album art
4. **Tree Shaking**: Ensure unused code is removed

## Monitoring & Maintenance

### GitHub Pages
- Check deployment status in Actions tab
- Monitor bandwidth usage (100GB/month limit)
- Update base path if repository name changes

### Backend Hosting
- Monitor usage against free tier limits
- Set up automatic scaling if needed
- Configure backups for database

## Cost Comparison

| Platform | Frontend | Backend | Database | Free Tier Limits |
|----------|----------|---------|----------|------------------|
| GitHub Pages | ✓ | ✗ | ✗ | 100GB bandwidth |
| Vercel | ✓ | ✓ (Serverless) | External | 100GB bandwidth |
| Netlify | ✓ | ✓ (Functions) | External | 100GB bandwidth |
| Railway | ✓ | ✓ | ✓ | 512MB RAM, 1GB disk |
| Render | ✗ | ✓ | External | 750 hours/month |

## Recommendation

For Raagam's requirements (music streaming with local files), I recommend:

1. **Frontend**: GitHub Pages (for demo) or Vercel/Netlify (for production)
2. **Backend**: Railway or Render (persistent hosting needed for file serving)
3. **Database**: SQLite on Railway/Render, or Vercel Postgres

This provides the best balance of ease of use, cost, and features for a personal music player.</content>
<parameter name="filePath">/Users/sushmachandu/Documents/Python/MusicPlayer/personalMusicPlayer/DEPLOYMENT_GUIDE.md