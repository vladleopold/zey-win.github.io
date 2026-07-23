## Critical Rule

After every change to `builder.js`, bump the cache version in `index.html`:
```
<script src="builder.js?vN"></script>
```
Increment N (e.g., v16 → v17 → v18). This forces browser cache refresh so users see the latest JS.