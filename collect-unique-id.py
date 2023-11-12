import re
import pymongo
import pandas as pd
import matplotlib.pyplot as plt
from dotenv import load_dotenv
import os

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

# Regular expression to match UUIDs or similar unique identifiers
uuid_pattern = re.compile(r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b')

# Function to search for unique IDs in a string
def search_unique_ids(text):
    return uuid_pattern.findall(str(text))

# Initialize a dictionary to hold the count of each unique ID for all versions
unique_id_counts_versions = {}

# Check each document in the collection
for document in collection.find():
    version = 'logged_in' if document.get('loggedIn', False) else 'logged_out'
    if version not in unique_id_counts_versions:
        unique_id_counts_versions[version] = {}
    unique_id_counts = unique_id_counts_versions[version]

    # Check URL, headers, and POST data for unique IDs
    components = [document.get('url', ''), str(document.get('headers', '')), document.get('postData', '')]
    for component in components:
        if component:  # Check if the component is not None or empty
            ids_found = search_unique_ids(component)
            for uid in ids_found:
                unique_id_counts[uid] = unique_id_counts.get(uid, 0) + 1

# Threshold for occurrences
threshold = 3

# Function to create a DataFrame filtered by the threshold
def create_filtered_df(unique_id_counts):
    filtered_unique_ids = {uid: count for uid, count in unique_id_counts.items() if count >= threshold}
    df_unique_ids = pd.DataFrame(list(filtered_unique_ids.items()), columns=['UniqueID', 'Count'])
    return df_unique_ids.sort_values(by='Count', ascending=False)

# Create DataFrames for all versions
df_unique_ids_versions = {
    version: create_filtered_df(unique_id_counts)
    for version, unique_id_counts in unique_id_counts_versions.items()
}

# Display the DataFrames
for version, df in df_unique_ids_versions.items():
    print(f"{version.capitalize()}:")
    print(df)
    print()

# Data Visualization with Threshold for all versions
fig, axes = plt.subplots(nrows=1, ncols=len(df_unique_ids_versions), figsize=(20, 8))

for ax, (version, df) in zip(axes, df_unique_ids_versions.items()):
    ax.bar(df['UniqueID'], df['Count'], color='skyblue')
    ax.set_title(version.capitalize())
    ax.set_xlabel('Unique IDs')
    ax.set_ylabel('Occurrences')
    ax.grid(axis='y')
    ax.tick_params(labelrotation=90)

# Adjust layout and display
plt.suptitle(f'Occurrences of Unique IDs (Threshold: {threshold})')
plt.tight_layout(rect=[0, 0.03, 1, 0.95])  # Adjust the plot to ensure everything fits without overlap
plt.show()
