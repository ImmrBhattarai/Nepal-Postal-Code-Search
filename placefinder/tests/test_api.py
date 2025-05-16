from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_homepage():
    response = client.get("/")
    assert response.status_code == 200


def test_search():
    response = client.get("/search?q=Berlin")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
