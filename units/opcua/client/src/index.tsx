import { Button, Description, ItemList, React, Unit } from 'pr1';


export default {
  namespace: 'opcua',

  OptionsComponent(props) {
    return (
      <Description>
        <h2>OPC-UA</h2>

        <h3>Devices</h3>

        <ItemList entries={[
          { id: 'a',
            label: 'USB ACM 2',
            description: 'Disconnected',
            action: {
              type: 'link',
              target: `${props.baseUrl}/<device-id>`
            } },
          { id: 'b',
            label: 'USB ACM 2',
            description: 'Not configured',
            action: {
              type: 'explicit',
              contents: (
                <Button>Configure</Button>
              )
            } },
          { id: 'c',
            label: 'USB ACM 2',
            description: 'Not configured' }
        ]} />
      </Description>
    );
  }
} satisfies Unit;
