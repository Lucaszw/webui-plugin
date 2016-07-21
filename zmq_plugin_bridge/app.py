from flask import Flask
from gevent import monkey
monkey.patch_all()
from geventwebsocket.handler  import WebSocketHandler
from zmq import green as zmq
import gevent
import logging
import monitor as mn
import socketio


sio = socketio.Server()
app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'


NAMESPACE = '/zmq_plugin'


@sio.on('connect', namespace=NAMESPACE)
def connect(sid, environ):
    print('connect ', sid)
    sio.emit('connected', {'data': 'connected: {}'.format(sid)}, room=sid,
             namespace=NAMESPACE)


@sio.on('disconnect', namespace=NAMESPACE)
def disconnect(sid):
    print('disconnect ', sid)
    sio.emit('disconnect', {'disconnected': sid}, room=sid,
             namespace=NAMESPACE)


@sio.on('debug', namespace=NAMESPACE)
def debug(sid):
    import pdb; pdb.set_trace()


@sio.on('reset', namespace=NAMESPACE)
def reset(sid):
    plugin.reset()


if __name__ == '__main__':
    # wrap Flask application with socketio's middleware
    app = socketio.Middleware(sio, app)

    # deploy as an eventlet WSGI server
    plugin = mn.Plugin('monitor', 'tcp://localhost:31000', {zmq.SUBSCRIBE: ''})
    gevent.spawn(mn.run_plugin, sio, plugin, logging.INFO, NAMESPACE)
    gevent.pywsgi.WSGIServer(('', 5000), app,
                             handler_class=
                             WebSocketHandler).serve_forever()
