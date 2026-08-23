import os
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel

ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
ADMIN_SECRET_TOKEN = os.environ.get('ADMIN_SECRET_TOKEN', 'admin_secret_token_123_valid')

router = APIRouter(prefix='/api/admin', tags=['admin-auth'])


class AdminLoginEntry(BaseModel):
    username: str
    password: str


def verify_admin_auth(x_admin_token: str = Header(None)):
    """Dependency to enforce Admin authentication on mutation endpoints."""
    if x_admin_token != ADMIN_SECRET_TOKEN:
        raise HTTPException(status_code=401, detail='Admin authentication required. Please log in as admin.')


@router.post('/login')
def admin_login(entry: AdminLoginEntry):
    """Authenticate admin credentials and issue session token."""
    if entry.username == ADMIN_USERNAME and entry.password == ADMIN_PASSWORD:
        return {
            'message': 'Login successful',
            'token': ADMIN_SECRET_TOKEN,
            'username': ADMIN_USERNAME
        }
    raise HTTPException(status_code=401, detail='Invalid username or password')


@router.get('/verify')
def verify_admin(x_admin_token: str = Header(None)):
    """Verify validity of current admin token."""
    is_admin = x_admin_token == ADMIN_SECRET_TOKEN
    return {
        'is_admin': is_admin,
        'username': ADMIN_USERNAME if is_admin else None
    }
