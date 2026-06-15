from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from backend.api.routes import router

app = FastAPI(title='CSV 数据清洗工具')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(router)

dist_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist')
if os.path.exists(dist_path):
    app.mount('/assets', StaticFiles(directory=os.path.join(dist_path, 'assets')), name='assets')

    @app.get('/{full_path:path}')
    async def serve_frontend(full_path: str):
        index_path = os.path.join(dist_path, 'index.html')
        target = os.path.join(dist_path, full_path)
        if full_path and os.path.exists(target) and os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(index_path)


@app.get('/api/health')
async def health():
    return {'status': 'ok'}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
