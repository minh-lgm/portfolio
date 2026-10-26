# Portfolio site

Static, single file: `index.html` + `img/`. Bilingual (EN/VI toggle, remembers choice).

## Before publishing

1. Open `index.html` and replace:
   - `YOUR_EMAIL_HERE` (mailto link in the Contact section)
   - `YOUR_UPWORK_ID`, `YOUR_LINKEDIN`
   - "Minh" in the title/brand/footer if you want your full name
2. Check `img/pbi-overview.png` and `img/pbi-products.png` exist (Power BI demo). If not, delete the `#pbi-demo` article.
3. Preview locally:

```bash
python -m http.server 8080 --directory D:/minh/Coderschool/GitHub/moneymaker/portfolio
```

## Deploy to GitHub Pages (free)

```bash
cd D:/minh/Coderschool/GitHub/moneymaker/portfolio
git init
git add .
git commit -m "Portfolio"
git branch -M main
git remote add origin https://github.com/minh-lgm/portfolio.git
git push -u origin main
```

Then on GitHub: repo Settings → Pages → Source: `main` / root. The site appears at `https://minh-lgm.github.io/portfolio/` in a minute or two. Use that URL in the Upwork and vLance profiles.

## Rules for screenshots

- Only synthetic demo data. Nothing from client or employer systems, ever.
