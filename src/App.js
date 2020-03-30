import React from 'react';
import { View, SafeAreaView, Button, StyleSheet, Alert, Text, FlatList, ScrollView } from 'react-native';

import io from 'socket.io-client';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  RTCSessionDescription,
  RTCIceCandidate
} from 'react-native-webrtc';

//const API = "http://192.168.1.100:5000";
const API = "https://web-rtc-prototype.herokuapp.com/";

const RTC_CONF = { iceServers: [{ url: 'stun:stun.l.google.com:19302' }] };

console.log(`API URL ${API};`);

export default function App() {
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [socket, setSocket] = React.useState();
  const [users, setUsers] = React.useState([]);

  const [pc, setPc] = React.useState(false);
  const [localStream, setLocalStream] = React.useState();
  const [remoteStream, setRemoteStream] = React.useState();
  const [answers, setAnswers] = React.useState({});

  React.useEffect(() => {
    if (pc) {
      //ивент, по которому добавится удаленный стрим
      pc.onaddstream = (e) => {
        if (e.stream) {
          console.log('onaddstream');
          setRemoteStream(e.stream);
        }
      }
      pc.onicecandidate = event => {
        if (event.candidate) {
          console.log('onicecandidate call');
          socket.emit('add-candidate', { candidate: event.candidate });
        }
      };
    }

    if (!connected && pc && !connecting) {
      //connecting to the signaling server
      try {
        console.log('starting connecting...');
        const s = io.connect(API);

        setConnecting(true);

        s.on('connect', () => {

          setPc(pc);

          console.log('socket: connect');
          setSocket(s);
          setConnected(true);
          setConnecting(false);
          console.log('emiting stream-ready');
          s.emit('stream-ready');
        })

      } catch (e) {
        console.log('Error: ', e);
      }
    }

    if (connected) {
      console.log(socket.id);
      socket.on('add-users', (data) => {
        console.log('socket: add-users');
        setUsers([...users, ...(data.users.map((item) => ({ id: item })))]);
      })

      socket.on('remove-user', (id) => {
        console.log('socket: remove-user');
        setUsers(users.filter((user => user.id != id)));
      });

      //принятие предложение и запуск трансляции на своей стороне 
      socket.on('offer-made', async (data) => {
        console.log('socket: offer-made');
        const { offer } = data;

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(new RTCSessionDescription(answer));
          console.log('make-answer');
          //говорю что этот клиент принял предложение и что второму можно включать трансляцию
          socket.emit('make-answer', {
            answer,
            to: data.socket
          })
        } catch (err) {
          console.log("error: ", err);
          Alert.alert("Cannot accept offer!");
        }
      });

      //если предложение принято, то запускаю процесс обмена офферами в обратную сторону
      socket.on('answer-made', async (data) => {
        try {
          const { answer, socket } = data;
          console.log('socket: answer-made');
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          if (!answers[socket]) {
            //в обратную сторону
            createOffer(socket);
            const newAnswer = {};
            newAnswer[socket] = true;
            setAnswers({ ...answer, ...newAnswer });
          }
        } catch (err) {
          console.log("error: ", err);
          Alert.alert("Cannot accept answer!");
        }

      });
      //принятие ICE кандидата от другого пира
      socket.on('candidate-added', async (data) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('socket: candidate-added');
        }
        catch (err) {
          Alert.alert("Error", "Error adding ICE candidate");
          console.log('Error: ', err);
        }

      });
    }

    return () => {
      if (connected) {
        socket.off('add-users');
        socket.off('remove-user');
        socket.off('make-answer');
        socket.off('offer-made');
        socket.off('answer-made');
        socket.off('candidate-added');
        socket.off('connect');
      }
    }
  }, [connected, users, socket, pc, answers, connecting]);


  const startLocalStream = async () => {
    // isFront will determine if the initial camera should face user or environment
    const isFront = true;
    const devices = await mediaDevices.enumerateDevices();

    const facing = isFront ? 'front' : 'environment';
    const videoSourceId = devices.find(device => device.kind === 'videoinput' && device.facing === facing);
    const facingMode = isFront ? 'user' : 'environment';
    const constraints = {
      audio: true,
      video: {
        mandatory: {
          minWidth: 500, // Provide your own width, height and frame rate here
          minHeight: 300,
          minFrameRate: 30,
        },
        facingMode,
        optional: videoSourceId ? [{ sourceId: videoSourceId }] : [],
      },
    };
    const newStream = await mediaDevices.getUserMedia(constraints);
    setLocalStream(newStream);
    const peerCon = new RTCPeerConnection(RTC_CONF);
    peerCon.addStream(newStream);

    setPc(peerCon);
  };
  const createOffer = async (id) => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(new RTCSessionDescription(offer));
      console.log('make-offer');
      socket.emit('make-offer', {
        offer: offer,
        to: id
      })
    } catch (e) {
      console.log(e);
      Alert.alert("Cannot send an offer.");
    }
  }

  const renderUser = (item) => {
    return (
      <Button
        title={"Call " + item.item.id}
        style={styles.userButton}
        disabled={!pc}
        onPress={() => {
          console.log('tap on', item.item.id);
          createOffer(item.item.id);
        }} />
    );
  }
  return (

    <View style={styles.container}>
      <View style={styles.header}>
        {connecting && <Text style={styles.text}>Connecting...</Text>}
        {connected && socket && <Text style={styles.text}>You: {<Text style={styles.smallText}>{socket.id}</Text>}</Text>}

        {!localStream && <Button title="Tap to connect and start stream" onPress={startLocalStream} style={{ marginTop: 50 }} />}
        {connected &&
          <View styles={styles.usersBlock}>
            <Text style={{ ...styles.text, marginTop: 20 }}>Users</Text>
            <FlatList
              style={styles.users}
              data={users}
              renderItem={renderUser}
              keyExtractor={(item) => item.id}
            />

          </View>

        }
      </View>

      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={styles.rtcview}>
          {localStream && <RTCView style={styles.rtc} streamURL={localStream.toURL()} />}
        </View>
        <View style={styles.rtcview}>
          {remoteStream && <RTCView style={styles.rtc} streamURL={remoteStream.toURL()} />}
        </View>
      </View>


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#313131',
    justifyContent: 'flex-start',
    //flexDirection: 'column',
    //alignItems: 'center',

    //alignItems: 'center',
    height: '100%',

  },
  usersBlock: {
    flex: 1,
    width: '%80',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15
  },
  text: {
    fontSize: 30,
    color: 'white'
  },
  smallText: {
    fontSize: 15,
    color: 'white'
  },
  rtcview: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '40%',
    width: '80%',
    backgroundColor: 'black',
    margin: 20
  },
  rtc: {
    width: '80%',
    height: '100%',
  },
  toggleButtons: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  users: {
    paddingVertical: 10
  },
  userButton: {
    marginTop: 10,
    width: '80%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15
  }
});