# PlaceFinder

PlaceFinder is a FastAPI application that allows users to search for postal codes in Nepal. It provides an API to search for places by name or postal code, manage a list of favorite places, and potentially other location-based services.

## Features

*   Search for postal codes by place name.
*   Autocomplete suggestions for place names.
*   Manage a list of favorite places.
*   (Potentially more features like weather, nearby places - based on `app/api.py` stubs)

## Running the Project

There are two primary ways to run this project: locally using a Python environment, or using Docker.

### Locally

1.  **Prerequisites**:
    *   Python 3.11 or higher.
    *   `pip` for package management.
    *   `venv` for creating virtual environments (usually included with Python).

2.  **Setup**:
    *   Clone the repository (if you haven't already).
    *   Navigate to the project directory: `cd placefinder`
    *   Create a virtual environment:
        ```bash
        python -m venv venv
        ```
    *   Activate the virtual environment:
        *   On macOS and Linux:
            ```bash
            source venv/bin/activate
            ```
        *   On Windows:
            ```bash
            venv\\Scripts\\activate
            ```
    *   Install the required Python packages:
        ```bash
        pip install -r requirements.txt
        ```

3.  **Running the Application**:
    *   Ensure your virtual environment is active.
    *   Once dependencies are installed, you can run the FastAPI application using Uvicorn:
        ```bash
        uvicorn app.main:app --reload
        ```
    *   The application will typically be available at `http://127.0.0.1:8000`.
    *   To deactivate the virtual environment when you are done:
        ```bash
        deactivate
        ```

### Using Docker

The project includes a `Dockerfile` for building a container image and a `run.sh` script to simplify building and running the container.

1.  **Prerequisites**:
    *   Docker installed and running.

2.  **Build and Run**:
    *   Navigate to the project directory: `cd placefinder`
    *   Make the `run.sh` script executable (if needed):
        ```bash
        chmod +x run.sh
        ```
    *   Execute the script:
        ```bash
        ./run.sh
        ```
    *   This script will:
        *   Build the Docker image tagged as `placefinder`.
        *   Stop and remove any existing container named `placefinder-container`.
        *   Start a new container named `placefinder-container` in detached mode, mapping port 8000 on your host to port 8000 in the container.
    *   The application will be available at `http://localhost:8000`.

## Configuration

*   **Dependencies**: All Python dependencies are listed in `requirements.txt`.
*   **Environment Variables**: The application uses a `.env` file for configuration, managed by `pydantic.BaseSettings` in `app/config.py`. Create a `.env` file in the root of the `placefinder` directory if you need to override default settings (e.g., `APP_NAME`, `DEBUG`).
    Example `.env` file:
    ```
    APP_NAME="My PlaceFinder"
    DEBUG=False
    ```

## API Endpoints

The main API routes are defined in `app/api.py`. Key endpoints include:

*   `/`: Serves the main HTML page.
*   `/search`: Search for places.
*   `/autocomplete`: Get place name suggestions.
*   `/favorites`: Manage favorite places.
*   `/health`: Health check.

Refer to the FastAPI documentation (usually at `/docs` or `/redoc` when the app is running) for a detailed API specification.

## Testing

Tests are located in the `tests/` directory and can be run using `pytest`. Ensure you have `pytest` installed (`pip install pytest`).

To run tests:
```bash
PYTHONPATH=. pytest
```
(The `PYTHONPATH=.` is important if running from the `placefinder` root, so that `app.main` can be found by the tests. The CI workflow uses `PYTHONPATH=placefinder pytest` which assumes running from one directory above `placefinder` or that `placefinder` is in the python path).
