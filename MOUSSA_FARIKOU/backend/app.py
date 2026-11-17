from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Autorise Angular (qui tourne sur le port 4200) à interroger cette API
CORS(app, resources={r"/api/*": {"origins": "http://localhost:4200"}})

# Création de la route (endpoint)
@app.route('/api/valeur', methods=['GET'])
def get_valeur():
    # Le backend renvoie un dictionnaire qui sera converti en JSON
    return jsonify({"message": "Bonjour depuis le serveur Python ! Application développée par MOUSSA"})

if __name__ == '__main__':
    # Le serveur Python tournera sur http://localhost:5000
    app.run(debug=True, port=5000)
