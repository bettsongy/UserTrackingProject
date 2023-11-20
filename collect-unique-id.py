import re
import pymongo
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from dotenv import load_dotenv
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

# Load environment variables from .env file
load_dotenv()

# Accessing variables from environment
MONGODB_URI = os.getenv('MONGODB_URI')
MONGODB_DB = os.getenv('MONGODB_DB')
MONGODB_COLLECTION = os.getenv('MONGODB_COLLECTION')

# MongoDB connection setup using environment variables
client = pymongo.MongoClient(MONGODB_URI)
db = client[MONGODB_DB]
collection = db[MONGODB_COLLECTION]

# Regular expression to match any string containing 'ID'
id_pattern = re.compile(r'.*ID.*', re.IGNORECASE)

# Function to search for and return entire strings containing 'ID'
def search_id_strings(text):
    return id_pattern.findall(str(text))

# Initialize a dictionary to hold the count of each original string containing 'ID' for all versions
id_counts_versions = {'logged_in': {}, 'logged_out': {}}

# Function to process a single document
def process_document(document):
    version = 'logged_in' if document.get('loggedIn', False) else 'logged_out'
    id_counts = id_counts_versions[version]
    
    components = [document.get('url', ''), str(document.get('headers', '')), document.get('postData', '')]
    for component in components:
        if component:
            ids_found = search_id_strings(component)
            for full_string in ids_found:
                id_counts[full_string] = id_counts.get(full_string, 0) + 1

# Function to create a DataFrame filtered by the threshold
def create_filtered_df(id_counts):
    filtered_ids = {full_string: count for full_string, count in id_counts.items() if count >= threshold}
    df_ids = pd.DataFrame(list(filtered_ids.items()), columns=['IDString', 'Count'])
    return df_ids.sort_values(by='Count', ascending=False)

# Concurrent processing of documents
def run_concurrently():
    with ThreadPoolExecutor(max_workers=os.cpu_count()) as executor:
        futures = [executor.submit(process_document, doc) for doc in collection.find()]
        for future in as_completed(futures):
            future.result()  # We just need to wait for all futures to complete

# Main execution
if __name__ == "__main__":
    run_concurrently()

    # Create DataFrames for all versions
    df_id_versions = {
        version: create_filtered_df(id_counts)
        for version, id_counts in id_counts_versions.items()
    }

    # Create subplots: one for 'logged_in' and another for 'logged_out'
    fig = make_subplots(rows=2, cols=1, subplot_titles=(
        "Logged In - Occurrences of Original Strings Containing 'ID'",
        "Logged Out - Occurrences of Original Strings Containing 'ID'"
    ))

    # Generate Plotly interactive bar charts for 'logged_in'
    fig.add_trace(
        go.Bar(x=df_id_versions['logged_in']['IDString'], y=df_id_versions['logged_in']['Count'],
               hoverinfo='x+y', name='Logged In'),
        row=1, col=1
    )

    # Generate Plotly interactive bar charts for 'logged_out'
    fig.add_trace(
        go.Bar(x=df_id_versions['logged_out']['IDString'], y=df_id_versions['logged_out']['Count'],
               hoverinfo='x+y', name='Logged Out'),
        row=2, col=1
    )

    # Update layout to hide the x-axis tick labels
    fig.update_layout(
        xaxis=dict(showticklabels=False),
        xaxis2=dict(showticklabels=False),
        yaxis_title="Occurrences",
        yaxis2_title="Occurrences",
        showlegend=False,
        height=1200  # Adjust height to ensure both plots are visible without scrolling
    )

    fig.show()
