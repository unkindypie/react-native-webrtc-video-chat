import React from 'react';
import { View, SafeAreaView, Button, StyleSheet, Alert, Text, FlatList, ScrollView } from 'react-native';

import io from 'socket.io-client';
import { RTCPeerConnection, RTCView, mediaDevices, RTCSessionDescriptionType, RTCSessionDescription } from 'react-native-webrtc';

//const API = "http://192.168.1.102:5000";
const API = "https://web-rtc-prototype.herokuapp.com/";
//const RTC_CONF = { iceServers: [{ url: 'stun:stun.l.google.com:19302' }] };
const RTC_CONF = {
  iceServers: [{
    url: "stun:stun.services.mozilla.com",
    username: "somename56",
    credential: "somecredentials6767"
  }]
};


console.log(`API URL ${API};`);

export default function App() {
  const [connected, setConnected] = React.useState(false);
  const [socket, setSocket] = React.useState();
  const [users, setUsers] = React.useState([]);

  const [pc, serPc] = React.useState(false);
  const [localStream, setLocalStream] = React.useState();
  const [remoteStream, setRemoteStream] = React.useState();
  const [answers, setAnswers] = React.useState({});

  React.useEffect(() => {
    if (!connected && pc) {
      //connecting to signaling server
      try {
        setSocket(io.connect(API));
        setConnected(true);
        console.log('socket: connected to server');

      } catch (e) {
        console.log('Error: ', e);
      }
    }

    if (connected) {
      socket.on('add-users', (data) => {
        console.log('socket: add-users');
        setUsers([...users, ...(data.users.map((item) => ({ id: item })))]);
      })

      socket.on('remove-user', (id) => {
        console.log('socket: remove-user');
        setUsers(users.filter((user => user.id != id)));
      });

      //принятие предложение и запуск трансляции на своей стороне 
      socket.on('offer-made', async (data)=>{
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
        } catch(err) {
          console.log("error: ", err);
          Alert.alert("Cannot accept offer!");
        }
      });

      //если предложение принято, то запускаю процесс обмена офферами в обратную сторону
      socket.on('answer-made', async (data)=> {
        try {
          const { answer, socket } = data;
          console.log(pc);
          console.log(answer);
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          if(!answers[socket]) {
            //в обратную сторону
            createOffer(socket);
            const newAnswer = {};
            newAnswer[socket] = true;
            setAnswers({...answer, ...newAnswer});
          }
        } catch(err) {
          console.log("error: ", err);
          Alert.alert("Cannot accept answer!");
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

      }
    }
  }, [connected, users, socket, pc, answers]);


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
    serPc(peerCon);

    //ивент, по которому добавится удаленный стрим
    peerCon.onaddstream = (e) => {
      if (e.stream) {
        console.log('onaddstream');
        setRemoteStream(e.stream);
      }
    }

  };
  const createOffer = async (id) => {
    try{
      const offer = await pc.createOffer();
      await pc.setLocalDescription(new RTCSessionDescription(offer));
      console.log('make-offer');
      socket.emit('make-offer', {
        offer: offer,
        to: id
      })
    } catch(e) {
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
    <SafeAreaView style={styles.container}>
      {!connected && pc && <Text style={styles.text}>Connecting...</Text>}

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
      <View style={styles.rtcview}>
        {localStream && <RTCView style={styles.rtc} streamURL={localStream.toURL()} />}
      </View>
      <View style={styles.rtcview}>
        {remoteStream && <RTCView style={styles.rtc} streamURL={remoteStream.toURL()} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#313131',
    //justifyContent: 'flex-start',
    //flexDirection: 'column',
    //alignItems: 'center',
    height: '100%',
  },
  usersBlock: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 15
  },
  text: {
    fontSize: 30,
    color: 'white'
  },
  rtcview: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '40%',
    width: '80%',
    backgroundColor: 'black',
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
    marginTop: 10
  }
});