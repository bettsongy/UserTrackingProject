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

# Dictionary to hold the count of each unique ID found
unique_id_counts = {}

# Check each document in the collection
for document in collection.find():
    # Check URL, headers, and POST data for unique IDs
    components = [document.get('url', ''), str(document.get('headers', '')), document.get('postData', '')]
    for component in components:
        if component:  # Check if the component is not None or empty
            ids_found = search_unique_ids(component)
            for uid in ids_found:
                unique_id_counts[uid] = unique_id_counts.get(uid, 0) + 1

# Threshold for occurrences
threshold = 3

# Filter unique IDs that meet the threshold
filtered_unique_ids = {uid: count for uid, count in unique_id_counts.items() if count >= threshold}

# Convert the filtered counts to a pandas DataFrame for easier analysis
df_unique_ids = pd.DataFrame(list(filtered_unique_ids.items()), columns=['UniqueID', 'Count'])

# Sort the DataFrame based on the count of unique IDs
df_unique_ids = df_unique_ids.sort_values(by='Count', ascending=False)

# Display the DataFrame
print(df_unique_ids)

# Data Visualization with Threshold
plt.figure(figsize=(12, 8))  # Adjust the size of the figure
# Only plot the IDs that meet the threshold
plt.bar(df_unique_ids['UniqueID'], df_unique_ids['Count'], color='skyblue')
plt.xlabel('Unique IDs')
plt.ylabel('Occurrences')
plt.xticks(rotation=90)  # Rotate x-axis labels to prevent overlap
plt.title(f'Occurrences of Unique IDs (Threshold: {threshold})')
plt.tight_layout()  # Adjust the plot to ensure everything fits without overlap
plt.grid(axis='y')  # Add a grid on the y-axis for better readability
# If there are too many bars, you might want to show only the top N bars
if len(df_unique_ids) > 20:
    plt.xticks([])  # Hide x labels if there are too many
plt.show()
