import React from 'react';
import {View, SafeAreaView, Button, StyleSheet, Alert, Text, FlatList } from 'react-native';

import io from 'socket.io-client';
import {RTCPeerConnection, RTCView, mediaDevices } from 'react-native-webrtc';

const API = "http://192.168.1.102:5000";
let socket;

console.log(`API URL ${API};`);

export default function App() {
  const [connected, setConnected] = React.useState(false);
  const [users, setUsers] = React.useState([]);


  //connecting to signaling server
  React.useEffect(()=>{
    if(!connected) {
      try {
        socket = io.connect(API);
        setConnected(true);
        console.log('socket: connected to server');
        socket.on('add-users', (data)=>{
          console.log('socket: add-users');
          setUsers([...users, ...(data.users.map((item) => ({id: item})))]);
        })
      } catch(e) {
        console.log('Error: ', e);
      }
      
    }
  }, [connected]);

  return (
    <SafeAreaView style={styles.container}>
      {!connected && <Text style={styles.text}>Connecting...</Text>}
      {connected && 
        <FlatList
          data={users}
          renderItem={(item)=> {
            console.log(item);

          return (<Button title={item.item.id} onPress={()=>{
            console.log('tap on', item.item.id);
          }}/> )
        }}
        />}
      {/* <RTCView style={styles.rtc} streamURL={localStream.toURL()} /> */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#313131',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '100%',
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
});